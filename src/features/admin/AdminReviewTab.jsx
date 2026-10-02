import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { listWordMemory, listRecentReviews, getMemoryProfile } from '../../shared/api/memoryApi.js'
import { debugShiftMemory, debugRemoveWord, debugDueToday } from '../../shared/api/memoryDebugApi.js'
import { listLessonDeckFlags } from '../../shared/lib/lessonsApi.js'
import { wordKey } from '../../shared/lib/wordAudio/wordKey.js'
import { localToday } from '../review/reviewDecks.js'
import { diagnoseReview } from './reviewDiagnosis.js'
import { unlockReviewAudio, loadReviewScreen } from '../review/reviewLaunch.js'
import ReviewLaunching from '../review/ReviewLaunching.jsx'

const ReviewScreen = lazy(loadReviewScreen)

// Админ → «Повторение»: временный вход в плеер повторения (этап 4 системы
// повторения, до вкладки «Моё обучение» этапа 5) и инструменты проверки —
// своя память слов (шаг, срок), «прожить N дней» (memory_debug_shift: сроки слов И журнал повторений сдвигаются назад, как
// будто дни прошли — бюджет карточек дня свободен) и «На сегодня» (memory_debug_today: слова к повтору сегодня). Под
// счётчиком — диагноз (reviewDiagnosis.js): почему слова «к повтору», а вкладка «Память» молчит — исчерпан лимит
// карточек дня или у слов нет колоды. В режиме «новенький» всё идёт в песочницу (memoryDebugApi.js).
export default function AdminReviewTab() {
  const [rows, setRows] = useState(null) // null — загрузка
  const [env, setEnv] = useState({ reviews: [], minutes: 5, deckWords: new Set() }) // журнал, минуты в день, слова с колодой
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(() => Promise.all([
    listWordMemory(), listRecentReviews(2), getMemoryProfile(), listLessonDeckFlags().catch(() => []),
  ]).then(([m, reviews, { minutes }, lessons]) => {
    setRows([...m].sort((a, b) => a.due_on.localeCompare(b.due_on) || a.word.localeCompare(b.word)))
    setEnv({ reviews, minutes, deckWords: new Set(lessons.filter(l => l.deck).map(l => wordKey(l.title)).filter(Boolean)) })
  }), [])

  useEffect(() => { load() }, [load]) // первичная загрузка списка

  async function shift(days) {
    const n = await debugShiftMemory(days)
    setNote(n == null ? 'Не вышло (нужна миграция памяти и права админа)' : `Сдвинуто слов: ${n} на ${days} дн. — журнал повторений тоже, лимит карточек дня свободен`)
    load()
  }

  // Слова (words — список; null — все) к повтору сегодня и свободный лимит карточек дня
  async function toToday(words = null) {
    const r = await debugDueToday(words)
    setNote(!r?.ok ? 'Не вышло (нужна миграция 20261002130000_memory_debug_today.sql и права админа)'
      : `К повтору сегодня: ${r.words} слов${r.journal ? ` · журнал за сегодня сдвинут (${r.journal}) — лимит карточек свободен` : ''}`)
    load()
  }

  async function remove(word) {
    const n = await debugRemoveWord(word)
    setNote(n == null ? 'Не вышло (нужна миграция memory_debug_add и права админа)' : `«${word}» убрано из обучения`)
    load()
  }

  const today = localToday()
  const diag = diagnoseReview({ rows: rows ?? [], ...env, today })

  return (
    <div className="aeWrap">
      <div className="aeHead">
        <span className="aeTitle">Повторение (тест)</span>
        <button className="aeRefresh" onClick={load}>Обновить</button>
      </div>
      <p className="aeHint">
        Слов в памяти: {rows?.length ?? '…'} · к повтору сегодня: {rows ? diag.due : '…'} · в расписание попадут: {rows ? diag.ready : '…'}
      </p>
      <p className="aeHint">Карточек показано сегодня: {rows ? `${diag.shown} из ${diag.budget}` : '…'}</p>
      {diag.blocked === 'budget' && (
        <p className="aeHint arvWarn">Лимит карточек на сегодня исчерпан — вкладка «Память» не предлагает повтор («Памяти пора отдыхать»). «Все слова — на сегодня» или «Прожить день» освободят его.</p>
      )}
      {diag.blocked === 'deck' && (
        <p className="aeHint arvWarn">У слов к повтору нет колоды — в расписание они не попадают (Админ → Колоды: добавь карточки уроку-слову).</p>
      )}
      <div className="arvActions">
        <button className="arvStart" onClick={() => { unlockReviewAudio(); setOpen(true) }}>Начать повторение</button>
        <button className="aeRefresh" onClick={() => shift(1)}>Прожить 1 день</button>
        <button className="aeRefresh" onClick={() => shift(7)}>Прожить 7 дней</button>
        <button className="aeRefresh" onClick={() => toToday(null)}>Все слова — на сегодня</button>
      </div>
      {note && <p className="aeHint">{note}</p>}
      {rows?.length === 0 && (
        <p className="aeHint">Память пуста — пройди урок-слово или добавь слово: Колоды → «＋ В обучение»</p>
      )}
      {(rows ?? []).map(r => (
        <div key={r.word} className="aeRow arvRow">
          <span className="arvWord">{r.word}</span>
          <span className="arvMeta">
            шаг {r.step} · {r.due_on <= today ? 'сегодня' : r.due_on}{env.deckWords.has(r.word) ? '' : ' · нет колоды'}
          </span>
          {r.due_on > today && <button className="aeRefresh" onClick={() => toToday([r.word])}>На сегодня</button>}
          <button className="aeRefresh" onClick={() => remove(r.word)}>Убрать</button>
        </div>
      ))}
      {open && (
        <Suspense fallback={<ReviewLaunching />}>
          <ReviewScreen onClose={() => { setOpen(false); load() }} />
        </Suspense>
      )}
    </div>
  )
}

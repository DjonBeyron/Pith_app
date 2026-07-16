import { useEffect, useMemo, useState } from 'react'
import { fetchLessonTitles } from '../../shared/lib/lessonsApi.js'
import { displayDifficulty } from '../../shared/api/difficultyApi.js'

const LEVELS = [
  { v: 1, label: 'Легко',  cls: 'diffEasy' },
  { v: 2, label: 'Средне', cls: 'diffMid' },
  { v: 3, label: 'Сложно', cls: 'diffHard' },
]

const DOT_CLASS = { 1: 'fsDotEasy', 2: 'fsDotMid', 3: 'fsDotHard' }

// Кэш на сессию (сбрасывается только перезагрузкой страницы): заголовки
// уроков по id, чтобы повторное открытие панели не делало запрос заново
let lessonTitleCache = null

// Панель поиска+фильтра ленты (кнопка 🔍 в шапке FeedTabsHeader). ГИБРИД:
// чипы сложности сужают саму ленту (см. useFeedFilter, применяется в
// FeedTab к массиву модулей до виртуализатора); текстовый поиск ленту НЕ
// трогает — показывает список совпадений прямо под полем, тап по строке
// закрывает панель и поворачивает ленту к фразе (onJumpToModule → jumpTo
// из useFeedModules, тот же приём что deep-link репоста).
export default function FeedSearchPanel({ modules, diffSelected, onToggleDiff, onClose, onJumpToModule }) {
  const [query, setQuery] = useState('')
  const [lessonTitles, setLessonTitles] = useState(lessonTitleCache ?? {})

  // Ленивая загрузка названий уроков — один лёгкий запрос при первом
  // открытии панели (минимальный select id, title по уже загруженным
  // published-модулям — модули приходят сюда только опубликованные)
  useEffect(() => {
    if (lessonTitleCache || !modules.length) return
    const ids = [...new Set(modules.flatMap(m => m.lessonIds ?? []))]
    fetchLessonTitles(ids).then(map => {
      lessonTitleCache = map
      setLessonTitles(map)
    })
  }, [modules])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return modules
      .filter(m => {
        if (m.title?.toLowerCase().includes(q)) return true
        return (m.lessonIds ?? []).some(id => lessonTitles[id]?.toLowerCase().includes(q))
      })
      .slice(0, 30)
      .map(m => ({ id: m.id, title: m.title, level: displayDifficulty(m, null, false) }))
  }, [query, modules, lessonTitles])

  return (
    <>
      <div className="fsBackdrop" onClick={onClose} />
      <div className="fsPanel">
        <div className="fsHead">
          <span className="fsHeadTitle">Фильтры</span>
          <span className="fsHeadHint">отбор фраз по сложности и поиск по слову</span>
        </div>
        <div className="fsChips">
          {LEVELS.map(l => (
            <button
              key={l.v}
              className={`fsChip ${l.cls}${diffSelected.has(l.v) ? ' fsChipOn' : ''}`}
              onClick={() => onToggleDiff(l.v)}>
              <span className="diffDot" />
              {l.label}
            </button>
          ))}
        </div>
        <input
          className="fsInput"
          placeholder="Название фразы или слово из урока…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        {query.trim() && (
          results.length > 0 ? (
            <div className="fsResults">
              {results.map(r => (
                <button key={r.id} className="fsResultRow" onClick={() => onJumpToModule(r.id)}>
                  <span className={`fsResultDot ${r.level ? DOT_CLASS[r.level] : 'fsDotGrey'}`} />
                  <span className="fsResultTitle">{r.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="fsNoResults">Ничего не найдено</div>
          )
        )}
      </div>
    </>
  )
}
